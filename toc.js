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
  var SHARE_TITLE = 'Share via';

  /* 24x24 paths, drawn in currentColor so they pick up the link colours. */
  var ICONS = {
    linkedin:
      'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.454C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.225 0z',
    x:
      'M18.901 1.153h3.68l-8.04 9.19L24 22.846h-7.406l-5.8-7.584-6.638 7.584H.474l8.6-9.83L0 1.154h7.594l5.243 6.932ZM17.61 20.644h2.039L6.486 3.24H4.298Z',
    email:
      'M20 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4l-8 5-8-5V6l8 5 8-5v2z',
    link:
      'M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z'
  };

  function icon(name) {
    return (
      '<svg class="nb-share__icon" viewBox="0 0 24 24" width="18" height="18"' +
      ' fill="currentColor" aria-hidden="true" focusable="false">' +
      '<path d="' + ICONS[name] + '"></path></svg>'
    );
  }

  /* The mirror is served from a prototype host, so share the canonical article
   * URL that mirror.py stamps in rather than wherever this copy happens to be. */
  function shareUrl() {
    var canonical = document.querySelector('link[rel="canonical"]');
    return (canonical && canonical.href) || window.location.href;
  }

  function shareTitle() {
    var og = document.querySelector('meta[property="og:title"]');
    return (og && og.content) || document.title || '';
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text);
    }
    /* execCommand is deprecated but is the only fallback on non-secure origins,
     * which includes opening the file locally over http. */
    var field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'absolute';
    field.style.left = '-9999px';
    document.body.appendChild(field);
    field.select();
    try {
      document.execCommand('copy');
    } catch (err) {
      /* nothing useful to do; the status message just will not confirm */
    }
    document.body.removeChild(field);
    return Promise.resolve();
  }

  /* Rendered inside the collapsible panel, so on mobile it appears only once
   * the contents are expanded. */
  function buildShare() {
    var url = shareUrl();
    var title = shareTitle();
    var encodedUrl = encodeURIComponent(url);
    var encodedTitle = encodeURIComponent(title);

    var targets = [
      {
        name: 'LinkedIn',
        icon: 'linkedin',
        href: 'https://www.linkedin.com/sharing/share-offsite/?url=' + encodedUrl
      },
      {
        name: 'X',
        icon: 'x',
        href: 'https://x.com/intent/tweet?url=' + encodedUrl + '&text=' + encodedTitle
      },
      {
        name: 'Email',
        icon: 'email',
        href: 'mailto:?subject=' + encodedTitle + '&body=' + encodeURIComponent(title + '\n\n' + url)
      }
    ];

    var wrap = document.createElement('div');
    wrap.className = 'nb-share';

    var heading = document.createElement('p');
    heading.className = 'nb-toc__title nb-share__title';
    heading.textContent = SHARE_TITLE;

    var list = document.createElement('ul');
    list.className = 'nb-share__list';

    targets.forEach(function (target) {
      var item = document.createElement('li');
      var link = document.createElement('a');
      link.className = 'nb-share__link';
      link.href = target.href;
      link.setAttribute('aria-label', 'Share on ' + target.name);
      if (target.icon !== 'email') {
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
      }
      link.innerHTML = icon(target.icon);
      item.appendChild(link);
      list.appendChild(item);
    });

    var status = document.createElement('span');
    status.className = 'nb-share__status';
    status.setAttribute('role', 'status');
    status.setAttribute('aria-live', 'polite');

    var copyItem = document.createElement('li');
    var copy = document.createElement('button');
    copy.className = 'nb-share__link nb-share__copy';
    copy.type = 'button';
    copy.setAttribute('aria-label', 'Copy link');
    copy.innerHTML = icon('link');

    var reset;
    copy.addEventListener('click', function () {
      copyText(url);
      copy.classList.add('is-copied');
      status.textContent = 'Link copied';
      window.clearTimeout(reset);
      reset = window.setTimeout(function () {
        copy.classList.remove('is-copied');
        status.textContent = '';
      }, 2000);
    });

    copyItem.appendChild(copy);
    list.appendChild(copyItem);

    wrap.appendChild(heading);
    wrap.appendChild(list);
    wrap.appendChild(status);
    return wrap;
  }

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

    /* List and share collapse as one unit on mobile, so the disclosure
     * controls a panel wrapping both rather than the list alone. */
    var panel = document.createElement('div');
    panel.className = 'nb-toc__panel';
    panel.id = 'nb-toc-panel';

    var toggle = document.createElement('button');
    toggle.className = 'nb-toc__toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panel.id);
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

    panel.appendChild(list);
    panel.appendChild(buildShare());

    inner.appendChild(toggle);
    inner.appendChild(staticTitle);
    inner.appendChild(panel);
    nav.appendChild(inner);

    return { nav: nav, panel: panel, toggle: toggle, links: links };
  }

  /* Mobile only: on desktop toc.css forces the panel visible and hides the
   * button, so the collapsed state must not survive a resize back up. */
  function wireToggle(toggle, panel) {
    var mobile = window.matchMedia('(max-width: 1023px)');

    function apply() {
      var collapsed = mobile.matches;
      panel.hidden = collapsed;
      toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    }

    toggle.addEventListener('click', function () {
      var open = toggle.getAttribute('aria-expanded') === 'true';
      toggle.setAttribute('aria-expanded', open ? 'false' : 'true');
      panel.hidden = open;
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
    wireToggle(toc.toggle, toc.panel);
    wireSpy(headings, toc.links);
    wireClicks(toc.links);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
