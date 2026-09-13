/* Table of contents
 *
 * Builds a TOC from the article's h2 headings, wires up scroll-spy and
 * smooth-scrolling, and switches the post container into the two-column
 * layout defined in toc.css. Runs against the mirrored markup as-is: the
 * headings carry no ids in the source, so they get slugs here.
 */
(function () {
  'use strict';

  var CONTAINER = '.blog-page .inner-container.post';
  var HEADINGS = '.blog-page .article-body h2';
  var TITLE = 'On this page';

  function slugify(text, taken) {
    var base = text
      .toLowerCase()
      .replace(/[‘’“”']/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'section';
    var slug = base;
    var n = 2;
    while (taken[slug]) {
      slug = base + '-' + n++;
    }
    taken[slug] = true;
    return slug;
  }

  /* The site header is position: fixed, so both the sticky offset and the
   * headings' scroll-margin key off its measured height rather than a guess. */
  function syncHeaderOffset() {
    var header = document.querySelector('.header-holder');
    var height = header ? Math.round(header.getBoundingClientRect().height) : 0;
    if (height > 0) {
      document.documentElement.style.setProperty(
        '--nb-toc-header-offset',
        height + 'px'
      );
    }
    return height;
  }

  function build(headings) {
    var nav = document.createElement('nav');
    nav.className = 'nb-toc';
    nav.setAttribute('aria-label', 'Table of contents');

    var inner = document.createElement('div');
    inner.className = 'nb-toc__inner';

    var list = document.createElement('ul');
    list.className = 'nb-toc__list';
    list.id = 'nb-toc-list';

    var toggle = document.createElement('button');
    toggle.className = 'nb-toc__toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', list.id);
    toggle.innerHTML =
      '<span class="nb-toc__title"></span><span class="nb-toc__chevron"></span>';
    toggle.firstChild.textContent = TITLE;

    var staticTitle = document.createElement('p');
    staticTitle.className = 'nb-toc__title nb-toc__title--static';
    staticTitle.textContent = TITLE;

    var links = headings.map(function (heading) {
      var item = document.createElement('li');
      item.className = 'nb-toc__item';

      var link = document.createElement('a');
      link.className = 'nb-toc__link';
      link.href = '#' + heading.id;
      link.textContent = (heading.textContent || '').trim();

      item.appendChild(link);
      list.appendChild(item);
      return link;
    });

    inner.appendChild(toggle);
    inner.appendChild(staticTitle);
    inner.appendChild(list);
    nav.appendChild(inner);

    return { nav: nav, list: list, toggle: toggle, links: links };
  }

  /* Mobile only: on desktop toc.css forces the list visible and hides the
   * button, so the collapsed state must not survive a resize back up. */
  function wireToggle(toggle, list) {
    var mobile = window.matchMedia('(max-width: 1023px)');

    function apply() {
      var collapsed = mobile.matches;
      list.hidden = collapsed;
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      list.hidden = open;
    });

    if (mobile.addEventListener) {
      mobile.addEventListener('change', apply);
    } else if (mobile.addListener) {
      mobile.addListener(apply);
    }
    apply();
  }

  function wireSpy(headings, links) {
    var active = -1;

    function update() {
      var offset = syncHeaderOffset() + 32;
      var index = 0;

      /* Near the bottom the last section may never clear the offset, so pin it
       * once the page cannot scroll any further. */
      var atBottom =
        window.innerHeight + window.pageYOffset >=
        document.documentElement.scrollHeight - 2;

      if (atBottom) {
        index = headings.length - 1;
      } else {
        for (var i = 0; i < headings.length; i++) {
          if (headings[i].getBoundingClientRect().top <= offset) {
            index = i;
          } else {
            break;
          }
        }
      }

      if (index === active) return;
      if (links[active]) links[active].removeAttribute('aria-current');
      links[index].setAttribute('aria-current', 'true');
      active = index;
    }

    var queued = false;
    function onScroll() {
      if (queued) return;
      queued = true;
      window.requestAnimationFrame(function () {
        queued = false;
        update();
      });
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    update();
  }

  function wireClicks(links) {
    var reduced = window.matchMedia('(prefers-reduced-motion: reduce)');

    links.forEach(function (link) {
      link.addEventListener('click', function (event) {
        var id = link.getAttribute('href').slice(1);
        var target = document.getElementById(id);
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({
          behavior: reduced.matches ? 'auto' : 'smooth',
          block: 'start'
        });

        /* replaceState keeps the address bar honest without the extra history
         * entry (and the jump) a default anchor click would add. */
        if (window.history && window.history.replaceState) {
          window.history.replaceState(null, '', '#' + id);
        }
      });
    });
  }

  function init() {
    var container = document.querySelector(CONTAINER);
    var articleBody = container && container.querySelector('.article-body');
    var headings = [].slice.call(document.querySelectorAll(HEADINGS));

    if (!container || !articleBody || headings.length < 2) return;

    var taken = {};
    headings.forEach(function (heading) {
      if (!heading.id) {
        heading.id = slugify((heading.textContent || '').trim(), taken);
      } else {
        taken[heading.id] = true;
      }
    });

    var toc = build(headings);
    container.insertBefore(toc.nav, articleBody);
    container.classList.add('nb-toc-layout');

    syncHeaderOffset();
    wireToggle(toc.toggle, toc.list);
    wireSpy(headings, toc.links);
    wireClicks(toc.links);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
