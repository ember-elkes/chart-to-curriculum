"""Drives the page in headless Chrome against the demo server, checks behavior, and saves screenshots."""
import sys, json
from playwright.sync_api import sync_playwright

BASE = 'http://localhost:3100'
OUT = '/tmp/shots'
import os; os.makedirs(OUT, exist_ok=True)
errors, fails = [], []

def check(name, cond, extra=''):
    print(('PASS ' if cond else 'FAIL ') + name + (' ' + str(extra) if extra and not cond else ''))
    if not cond: fails.append(name)

with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox'])
    ctx = b.new_context(viewport={'width': 1360, 'height': 900}, permissions=['clipboard-read', 'clipboard-write'])
    page = ctx.new_page()
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.on('pageerror', lambda e: errors.append(str(e)))
    bad=[]
    page.on('response', lambda r: bad.append((r.status, r.url)) if r.status>=400 and '/api/chart' not in r.url else None)

    page.goto(BASE)
    page.screenshot(path=f'{OUT}/0-empty.png')
    check('app hidden before a chart is loaded', page.locator('#app').is_hidden())

    # bad URL shows a plain error
    page.fill('#chartUrl', 'https://example.com/x'); page.click('text=Read chart')
    page.wait_for_function("document.querySelector('#loadMsg').textContent.length > 0")
    check('bad URL gives an error message', 'catalog.mit.edu' in page.inner_text('#loadMsg'), page.inner_text('#loadMsg'))

    # load 21L
    page.click('text=Literature, Course 21L')
    page.wait_for_selector('#app:not([hidden])')
    page.wait_for_selector('.rule')
    check('21L title', page.inner_text('#chartTitle') == 'Literature (Course 21L)')
    labels = page.locator('.rule-label').all_inner_texts()
    check('21L rules derived', 'Choose 7 from Restricted Electives' in labels and 'No more than 3 introductory subjects' in labels, labels)
    check('footnote rules flagged for confirmation', page.locator('.rule .tag', has_text='from a footnote').count() >= 5)
    check('catalog hides courses not on OCW by default', 'hidden' in page.inner_text('#count'), page.inner_text('#count'))
    page.screenshot(path=f'{OUT}/1-21l-loaded.png', full_page=False)

    # add courses: 4 introductory (cap is 3) -> should turn red
    for code in ['21L.004', '21L.009', '21L.003']:
        page.click(f'.add[data-key="{code}"]')
    intro = page.locator('.rule', has_text='introductory subjects')
    check('3 introductory = at the cap, OK', 'ok' in intro.get_attribute('class'), intro.get_attribute('class'))
    # 21L.001/000 are not on OCW in the fixture; use dept-pool-free check with confirm override instead
    page.click('#ocwOnly')  # show courses not on OCW
    check('unchecking shows more courses', page.locator('.course').count() > 6, page.locator('.course').count())
    check('not-on-OCW course cannot be added', page.locator('.add[data-key="21L.001"]').is_disabled())

    # review dialog: 21L.001 not on OCW -> search and use a result
    page.click('.course:has(.c-code:text-is("21L.001")) >> text=Find it on OCW')
    page.wait_for_selector('#matchDialog[open]')
    page.fill('#mdSearch', 'shakespeare'); page.wait_for_selector('#mdResults li button')
    page.screenshot(path=f'{OUT}/2-dialog.png')
    page.click('#mdResults li button >> nth=0')
    page.wait_for_function("!document.querySelector('#matchDialog').open")
    check('manual match enables the course', page.locator('.add[data-key="21L.001"]').is_enabled())
    page.click('.add[data-key="21L.001"]')
    intro = page.locator('.rule', has_text='introductory subjects')
    check('4 introductory exceeds the cap -> over', 'over' in intro.get_attribute('class'), intro.get_attribute('class'))
    check('over-limit slot is marked', intro.locator('.slot.over').count() == 1)

    # edit the cap rule to 4 -> OK again
    intro.locator('text=Edit').click()
    page.fill('.rule-form[data-id] input[data-f=count]', '4'); page.keyboard.press('Tab')
    intro = page.locator('.rule', has_text='introductory subjects')
    check('editing the cap to 4 clears the warning', 'ok' in intro.get_attribute('class'), intro.get_attribute('class'))

    # persistence + share link
    page.reload(); page.wait_for_selector('.rule')
    check('plan survives a reload', page.locator('#plan li .code').count() == 4, page.locator('#plan li').count())
    page.click('text=Copy share link')
    link = page.evaluate('navigator.clipboard.readText()')
    check('share link copied', '#s=' in link)
    page.click('text=Copy for Notion')
    md = page.evaluate('navigator.clipboard.readText()')
    check('notion export has checklist', '## Requirements' in md and '- [ ] **21L.004**' in md, md[:200])
    page.screenshot(path=f'{OUT}/3-21l-plan.png')

    # share link opens in a fresh context with the same plan
    ctx2 = b.new_context(viewport={'width': 1360, 'height': 900}); p2 = ctx2.new_page(); p2.goto(link); p2.wait_for_selector('.rule')
    check('share link restores plan', p2.locator('#plan li .code').count() == 4)
    ctx2.close()

    # 21A: slots via department pool
    page.fill('#chartUrl', 'catalog.mit.edu/degree-charts/anthropology-course-21a'); page.click('text=Read chart'); page.wait_for_function("document.querySelector('#chartTitle').textContent.includes('21A')")
    page.click('.chip:has-text("All 21A subjects")') if page.locator('.chip:has-text("All 21A subjects")').count() else check('dept chip exists', False)
    check('dept courses listed', page.locator('.course').count() >= 8, page.locator('.course').count())
    for code in ['21A.00', '21A.01', '21A.155', '21A.112', '21A.211']:
        page.click(f'.add[data-key="{code}"]')
    page.screenshot(path=f'{OUT}/4-21a.png')
    r = page.locator('.rule', has_text='more subjects')
    check('21A open-slot rule counts dept courses', '5 of 8' in r.inner_text(), r.inner_text())
    page.click('.chip:has-text("All in chart")')
    check('renumbered course badge', 'On OCW as 21A.112' in page.inner_text('.course:has(.c-code:text-is("21A.802"))'))

    # keyboard focus + mobile layout
    page.set_viewport_size({'width': 390, 'height': 844}); page.wait_for_timeout(150)
    page.screenshot(path=f'{OUT}/5-mobile.png', full_page=False)
    overflow = page.evaluate('document.documentElement.scrollWidth > document.documentElement.clientWidth')
    check('no horizontal scroll on mobile', not overflow)
    b.close()

errors=[e for e in errors if 'status of 400' not in e]
check('no console errors', not errors, (errors, bad))
print('\nFAILED: ' + ', '.join(fails) if fails else '\nAll UI checks passed')
sys.exit(1 if fails else 0)
