// How the "no vertical scroll" check finds the right element in react-native-web:
// a <ScrollView> renders as a <div> whose computed overflow-y is auto or scroll, and its own
// scrollHeight/clientHeight describe the page content. The bottom tab bar and the app shell are
// not scrollable, so the scroller with the largest visible height is the screen's page. If it is
// taller inside than outside (scrollHeight > clientHeight) the user must scroll: the overflow is
// the difference. Also reports every scroller so a nested list is not mistaken for the page.

/** Runs inside the page; returns the page scroller's measurements and all scrollers found. */
export function measureInPage() {
  const scrollers = Array.from(document.querySelectorAll("div"))
    .filter((el) => ["auto", "scroll"].includes(getComputedStyle(el).overflowY))
    .map((el) => ({
      clientHeight: el.clientHeight,
      scrollHeight: el.scrollHeight,
      overflow: Math.max(0, el.scrollHeight - el.clientHeight),
      contentHeight: Math.round(el.firstElementChild ? el.firstElementChild.getBoundingClientRect().height : 0),
      top: Math.round(el.getBoundingClientRect().top),
    }))
    .filter((s) => s.clientHeight > 0);
  scrollers.sort((a, b) => b.clientHeight - a.clientHeight);
  return { page: scrollers[0] ?? null, scrollers, viewport: { width: window.innerWidth, height: window.innerHeight } };
}

/** Formats one PASS/FAIL line for a screen; a screen with no scroller at all trivially fits. */
export function verdictLine(name, measurement) {
  const overflow = measurement.page ? measurement.page.overflow : 0;
  const status = overflow <= 1 ? "PASS" : "FAIL";
  const detail = measurement.page ? `client ${measurement.page.clientHeight}px, content ${measurement.page.contentHeight}px, spare ${measurement.page.clientHeight - measurement.page.contentHeight}px` : "no scroll container";
  return `${status}  ${name}: overflow ${overflow}px (${detail})`;
}
