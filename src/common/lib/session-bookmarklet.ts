interface BookmarkletOptions {
	appOrigin: string;
	sessionId: string;
	captureToken: string;
}

export function createContextCaptureBookmarklet({
	appOrigin,
	sessionId,
	captureToken,
}: BookmarkletOptions) {
	const script = `
(() => {
  const endpoint = ${JSON.stringify(`${appOrigin}/api/sessions/${sessionId}/context`)};
  const captureToken = ${JSON.stringify(captureToken)};

  function findClosestLine(node) {
    let current = node;
    while (current) {
      if (current.dataset && current.dataset.lineNumber) return Number(current.dataset.lineNumber);
      if (current.id && /^L\\d+$/.test(current.id)) return Number(current.id.slice(1));
      current = current.parentElement;
    }
    return null;
  }

  function getVisibleLineRange() {
    const candidates = Array.from(document.querySelectorAll('[data-line-number], [id^="L"]'));
    const visible = candidates
      .map((element) => ({ element, rect: element.getBoundingClientRect() }))
      .filter(({ rect }) => rect.bottom >= 0 && rect.top <= window.innerHeight)
      .map(({ element }) => {
        const value = element.dataset?.lineNumber || (element.id && /^L\\d+$/.test(element.id) ? element.id.slice(1) : null);
        return value ? Number(value) : null;
      })
      .filter((value) => Number.isFinite(value));

    if (!visible.length) return { start: null, end: null };
    return { start: Math.min(...visible), end: Math.max(...visible) };
  }

  function getSelectionDetails() {
    const selection = window.getSelection();
    const text = selection ? selection.toString().trim() : '';
    if (!text || !selection || selection.rangeCount === 0) {
      return { text: null, start: null, end: null };
    }

    const anchorNode = selection.anchorNode instanceof Element ? selection.anchorNode : selection.anchorNode?.parentElement;
    const focusNode = selection.focusNode instanceof Element ? selection.focusNode : selection.focusNode?.parentElement;
    const anchorLine = anchorNode ? findClosestLine(anchorNode) : null;
    const focusLine = focusNode ? findClosestLine(focusNode) : null;

    if (anchorLine == null || focusLine == null) {
      return { text, start: null, end: null };
    }

    return {
      text,
      start: Math.min(anchorLine, focusLine),
      end: Math.max(anchorLine, focusLine),
    };
  }

  function getGitHubContext() {
    if (location.hostname !== 'github.com') return { repo: null, ref: null, path: null };

    const parts = location.pathname.split('/').filter(Boolean);
    if (parts.length < 2) return { repo: null, ref: null, path: null };

    const repo = parts.slice(0, 2).join('/');
    const kind = parts[2] || null;
    if (kind === 'blob' || kind === 'tree') {
      return {
        repo,
        ref: parts[3] || null,
        path: parts.slice(4).join('/') || null,
      };
    }

    return {
      repo,
      ref: null,
      path: parts.slice(2).join('/') || null,
    };
  }

  function getActiveSection() {
    if (location.hash) return location.hash.slice(1) || null;
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'));
    const visible = headings.find((heading) => {
      const rect = heading.getBoundingClientRect();
      return rect.top >= 0 && rect.top <= window.innerHeight * 0.35;
    });
    return visible ? visible.textContent?.trim() || null : null;
  }

  const visibleLineRange = getVisibleLineRange();
  const selection = getSelectionDetails();
  const githubContext = getGitHubContext();
  const payload = {
    captureToken,
    kind: selection.text ? 'selection' : 'page_view',
    pageUrl: location.href,
    repo: githubContext.repo,
    ref: githubContext.ref,
    path: githubContext.path,
    visibleStartLine: visibleLineRange.start,
    visibleEndLine: visibleLineRange.end,
    selectedText: selection.text,
    selectedStartLine: selection.start,
    selectedEndLine: selection.end,
    activeSection: getActiveSection(),
    payload: JSON.stringify({
      title: document.title,
      host: location.hostname,
      selectionLength: selection.text ? selection.text.length : 0,
      source: 'bookmarklet',
    }),
    occurredAt: Date.now(),
  };

  fetch(endpoint, {
    method: 'POST',
    mode: 'cors',
    headers: {
      'Content-Type': 'text/plain',
    },
    body: JSON.stringify(payload),
  })
    .then(async (response) => {
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(body?.error || 'Capture failed');
      }
      alert('Captured page context into planmd.');
    })
    .catch((error) => {
      alert('planmd capture failed: ' + error.message);
    });
})();
`.trim();

	return `javascript:${encodeURIComponent(script)}`;
}
