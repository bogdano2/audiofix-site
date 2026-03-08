# AudioFix.tools — Implementation Directives

**Version:** 3.5
**Date:** March 8, 2026
**Owner:** Bogdan Odulinski
**Status:** Active — applies to all current and future work

---

## Purpose

This document defines the standing requirements for all development on AudioFix.tools. Every enhancement, page addition, refactor, or platform expansion must comply with these directives. This is not a description of what exists — it is a set of rules for what must be true.

---

## 1. Content Philosophy & Pedagogy

### 1.1 Audience Principle

All content is written for a **non-technical primary audience** — but must never take a shortcut that erodes credibility. A highly technical reader should trust the material enough to share it with the non-technical people in their life. The goal is not to dumb things down; it is to make complex things genuinely clear.

**The credibility test:** If an IT professional, sysadmin, or audio engineer reads any page on this site, they should find it accurate, complete, and free of hand-waving — and immediately think "I should send this to my mom / my coworker / my client."

### 1.2 Content Structure: Manual First, Automation Second

- **Lead with manual methods.** Every troubleshooting topic must first teach the user how to fix the problem themselves using built-in OS tools, keyboard shortcuts, and settings URIs. The manual approach is the primary content.
- **The script is the payoff, not the starting point.** After the user understands what needs to happen and why, introduce the automation script as "this does everything you just learned, automatically." The script should feel like a natural acceleration of knowledge the reader already has.
- **Draw explicit parallels.** When describing what the script does, reference the manual steps: "Phase 1 (Identify) does exactly what you did in the manual section — it cycles through each device and plays a test tone, just like you did by clicking each one in Settings." This builds trust in the automation by grounding it in concepts the reader already understands.

### 1.3 Troubleshooting Pedagogy

- **Always explain the why.** Never present a step without explaining why it works. "Disable unused devices" is an instruction; "Disable unused devices because Windows will silently switch to any active device when conditions change — fewer active devices means fewer opportunities for drift" is understanding.
- **Tie steps to concepts.** Every troubleshooting action should connect to the underlying concept introduced in the educational sections. The reader should feel the site is teaching them a mental model, not just giving them a checklist.
- **Use proven pedagogical techniques:**
  - **Chunking:** Break complex procedures into named phases with clear boundaries. Each phase should feel completable and have a visible outcome before moving to the next.
  - **Concept-driven structure:** Organize around ideas ("why defaults drift," "the app-level complication"), not around UI navigation paths. The concept comes first; the clicks follow.
  - **Story-driven framing:** Set up each section with a recognizable scenario the reader has experienced ("You're on a Zoom call and suddenly nobody can hear you"). Make the reader feel seen before offering the fix.
  - **Progressive disclosure:** Start with the simplest explanation, then layer in detail for readers who want it. The casual reader gets the fix; the curious reader gets the architecture.

### 1.4 Voice & Tone

- **Empathetic but never patronizing.** Acknowledge that audio problems are genuinely frustrating and confusing. Never imply the user should have known better.
- **Technically precise but plainly spoken.** Use correct terminology ("audio endpoint," "PnP device," "Core Audio API") but always introduce it with a plain-English explanation first.
- **Sprinkle in personality.** Fun analogies, puns, and observations are encouraged in appropriate places — section intros, callout boxes, phase descriptions. They make the content memorable and signal that a human wrote this, not a template. Examples:
  - "Think of your audio devices like TV remotes on a couch — the more there are, the more likely someone grabs the wrong one."
  - "Stereo Mix: the audio device equivalent of that junk drawer everyone has but nobody opens."
- **Never let personality undermine precision.** A joke in a callout box is great. A joke where a specific setting path should be is not. Humor lives in the framing, not in the instructions.

### 1.5 Credibility Signals

- **Show specific numbers and paths.** Generic advice erodes trust. "Change your audio settings" is vague. "Press Win+R, type `ms-settings:sound`, press Enter" is credible.
- **Name the APIs and tools.** When explaining what the script does, name the actual Windows APIs (IMMDeviceEnumerator, IPolicyConfig) and cmdlets (Get-PnpDevice, Disable-PnpDevice). Non-technical readers will skip these; technical readers will trust the site because of them.
- **Acknowledge limitations.** If a method doesn't work in all cases, say so. "This works for most PCs, but Bluetooth devices may need additional pairing steps" is more trustworthy than implying universal coverage.
- **No marketing language.** Never describe the tool as "revolutionary," "cutting-edge," or "the best." Let the content's clarity and the tool's effectiveness speak for themselves.

---

## 2. Frontend Framework: Bootstrap

### 2.1 Version, Standards & Loading

- Use **Bootstrap 5.3+** only. Follow official documentation for:
  - Layout: https://getbootstrap.com/docs/5.3/layout/
  - Components: https://getbootstrap.com/docs/5.3/components/
  - Utilities: https://getbootstrap.com/docs/5.3/utilities/
  - Theming: https://getbootstrap.com/docs/5.3/customize/color-modes/
- Load Bootstrap CSS and JS bundle via CDN (`cdn.jsdelivr.net`). No local copies, no npm build step, no bundler.
- No jQuery. Bootstrap 5 is vanilla JS — jQuery must never be introduced.
- No external JS libraries unless explicitly requested.
- Use **vanilla JS** only for custom behavior. Use Bootstrap's JS APIs (Collapse, Modal, Offcanvas, etc.) when needed.

### 2.2 Color Palette & Theming

- A color palette will be provided per project. Apply it using Bootstrap's theming API.
- Define CSS variables in `:root` for light mode:
  ```css
  :root {
    --bs-primary: <value>;
    --bs-secondary: <value>;
    --bs-body-bg: <value>;
    --bs-body-color: <value>;
  }
  ```
- Define `[data-bs-theme="dark"]` overrides for dark mode:
  ```css
  [data-bs-theme="dark"] {
    --bs-primary: <value>;
    --bs-body-bg: <value>;
    --bs-body-color: <value>;
  }
  ```
- Use Bootstrap's recommended color-mode structure: https://getbootstrap.com/docs/5.3/customize/color-modes/
- Ensure all palette combinations meet WCAG AA contrast ratios.

### 2.3 Automatic Light/Dark Mode + Toggle

- Implement Bootstrap's official color-mode script:
  - Detect system/browser preference automatically on load.
  - Provide a toggle icon (sun/moon) that switches modes.
  - Store user preference in `localStorage`.
  - Follow Bootstrap's official pattern: https://getbootstrap.com/docs/5.3/customize/color-modes/#javascript

### 2.4 Component Usage Rules

- **Never invent custom components** unless explicitly requested. When creating new components, base them on existing Bootstrap patterns.
- When generating a component:
  1. Identify the closest official Bootstrap component.
  2. Extend it minimally using utility classes, layout patterns, and CSS variables.
  3. Avoid custom CSS unless absolutely necessary.
  4. If custom CSS is needed, place it in a `<style>` block with clear comments.
- **All UI elements** must use Bootstrap components. Do not hand-write CSS for patterns Bootstrap already provides (navbars, buttons, cards, alerts, tables, badges, accordions, modals, list groups, progress bars, tabs, etc.).
- **Navigation** must use `navbar` with `navbar-toggler` + `collapse` for mobile. Never hide nav links with CSS `display:none` at breakpoints — use Bootstrap's responsive collapse.
- **Buttons** must use `btn` classes. Style variants via `btn-primary`, `btn-outline-light`, etc.
- **Callouts / alerts** must use `alert` component with contextual classes (`alert-danger`, `alert-warning`, `alert-success`, `alert-info`).
- **Tables** must use `table` classes (`table-dark`, `table-striped`, `table-bordered`). Never build table-like layouts with CSS grid or flexbox.
- **Cards** for any boxed content — feature grids, roadmap items, requirement blocks, support banners.
- **Keyboard key indicators** must use `<kbd>` elements (Bootstrap styles these natively).
- **Icons** must use Bootstrap Icons: https://icons.getbootstrap.com/

### 2.5 Layout & HTML Structure

- Use semantic HTML5 elements (`<header>`, `<main>`, `<nav>`, `<section>`, `<article>`, `<aside>`, `<footer>`).
- Use Bootstrap's grid system (`container`, `row`, `col-*`) for all layouts.
- Use spacing utilities (`py-5`, `my-5`, `gap-3`, etc.) instead of custom CSS whenever possible.
- Use responsive typography classes (`display-1`, `fs-1`, etc.).
- Containers may use a `max-width` override for content-width constraints (e.g., 760px reading width).
- Responsive behavior must come from Bootstrap breakpoints (`col-md-*`, `col-lg-*`), not custom media queries.
- Ensure mobile-first behavior throughout.

### 2.6 Page Section Patterns

When generating page sections (hero, features, pricing, testimonials, FAQ, etc.):
- Use Bootstrap's official examples as the baseline: https://getbootstrap.com/docs/5.3/examples/
- Maintain consistent vertical spacing using `py-5`, `my-5`, etc.
- Use responsive typography classes.

Reliable references for structural inspiration (layout only — never copy code):
- Bootstrap Themes (official): https://themes.getbootstrap.com/
- Flowbite (structural inspiration only, no Tailwind classes): https://flowbite.com/
- Landing page inspiration: https://landings.dev, https://onepagelove.com, https://dribbble.com/tags/landing_page

### 2.7 Custom CSS Budget

- Target **<50 lines** of custom CSS. Permitted uses:
  - Brand-specific color tokens beyond Bootstrap's palette
  - Payment button styling
  - Code viewer max-height and scroll behavior
  - Hero section gradient overlays
  - Animations (bounce, fade) if `prefers-reduced-motion` is respected
- If custom CSS exceeds 50 lines, audit for Bootstrap equivalents before proceeding.
- All custom CSS must be in a `<style>` block with clear comments.

### 2.8 Typography

- Use Google Fonts (IBM Plex Sans / IBM Plex Mono or equivalent) via CDN with `display=swap`.
- Set font family via Bootstrap's `--bs-body-font-family` custom property, not by overriding `body` directly.

### 2.9 Output Standards

- All generated HTML must be complete and ready to use.
- Include `<head>` with Bootstrap CDN links.
- Include `<script>` for color-mode toggle.
- Include `<style>` for theme variables.
- Ensure all code is valid, minimal, and production-ready.

---

## 3. AI-Optimized SEO

### 3.1 Principle

All content must be structured for extraction by both traditional search engines (Google, Bing) and AI-powered search/answer engines (Google AI Overviews, Bing Copilot, Perplexity, ChatGPT web search). AI systems must be able to extract, summarize, and cite content accurately.

### 3.2 Semantic HTML

- Use HTML5 landmark elements throughout: `<header>`, `<nav>`, `<main>`, `<article>`, `<section>`, `<aside>`, `<footer>`.
- Every `<section>` must have an `aria-labelledby` pointing to its heading, or an `aria-label`.
- Never use `<div>` where a semantic element exists. AI parsers weight semantic HTML higher than generic containers.

### 3.3 Heading Hierarchy

- Single `<h1>` per page.
- Strict sequential nesting: H1 → H2 → H3. Never skip levels.
- Every new page or section addition must maintain valid heading hierarchy.

### 3.4 Content Patterns for AI Extraction

- **Lead with the answer.** Every section must open with a concise summary sentence that answers the implied question, followed by detailed explanation. This gives AI systems a clean extractable answer.
- **Be factually dense.** Include specific numbers, specific system paths, specific URIs, specific app menu paths. AI systems prefer content with verifiable specifics over vague descriptions.
- **Use `<table>` for structured data.** Never render tabular information as styled `<div>` grids. Tables are the format AI systems extract most reliably.
- **Use descriptive anchor IDs.** All section anchors must be human-readable slugs (`#understand`, `#manual-fix`, `#script`) that AI systems can reference in citations.

### 3.5 Structured Data: Format & Rules

- **JSON-LD only.** Never use Microdata or RDFa.
- Use **schema.org** vocabulary.
- Every page must output a single `<script type="application/ld+json">` block in `<head>`.
- Always use **`@graph`** to contain all entities for the page.
- One **primary entity** per page (`Article`, `SoftwareApplication`, `WebPage`, etc.).
- Auto-generate **secondary entities** as applicable (`BreadcrumbList`, `FAQPage`, `HowTo`, `ImageObject`, `VideoObject`).
- **Never hallucinate data.** If a field value is unknown, omit the field entirely.
- No comments inside JSON-LD.
- Never duplicate entities within the `@graph`.

### 3.6 Structured Data: Bootstrap-to-Schema Mapping

Bootstrap component patterns must produce corresponding schema entities. When custom card variants are created, assign them a semantic CSS class and map them here.

| Bootstrap Pattern | Schema Entity | Notes |
|---|---|---|
| `.card` with blog/article content | `Article` | Assign `.card.article-post` or similar semantic class |
| `.card` with downloadable tool | `SoftwareApplication` | |
| `.card` with testimonial/quote | `Review` | Assign `.card.testimonial` class |
| `.card` with team/person bio | `Person` | Assign `.card.team-member` class |
| `.accordion` | `FAQPage` | Each accordion item = one `Question` + `acceptedAnswer` |
| `.carousel` | `ImageObject[]` | One `ImageObject` per slide |
| `.navbar` | `SiteNavigationElement` | Optional — Google does not use this for rich results |
| `.breadcrumb` | `BreadcrumbList` | Required when breadcrumb nav is present |
| Steps / numbered list patterns | `HowTo` | Each step = one `HowToStep` |

Infer schema from Bootstrap layout structure (`container`, `row`, `col`) when content type is identifiable.

### 3.7 Structured Data: `@id` Conventions

Maintain stable `@id` URLs across the site using this naming convention:

| Entity | `@id` Pattern | Example |
|---|---|---|
| WebSite | `https://{domain}/#website` | `https://audiofix.tools/#website` |
| WebPage (per page) | `https://{domain}/{path}#webpage` | `https://audiofix.tools/#webpage` |
| Primary entity | `https://{domain}/{path}#{type}` | `https://audiofix.tools/#software` |
| FAQPage | `https://{domain}/{path}#faq` | `https://audiofix.tools/#faq` |
| BreadcrumbList | `https://{domain}/{path}#breadcrumb` | `https://audiofix.tools/#breadcrumb` |
| Organization | `https://{domain}/#organization` | `https://audiofix.tools/#organization` |

`@id` values must remain stable across deployments. Never generate random or session-based IDs.

### 3.8 Structured Data: Applicable Schema Types

Apply whichever schemas are relevant to the page content:

- `WebSite` — site identity and URL (every page)
- `WebPage` — page-level metadata (every page)
- `FAQPage` — for Q&A content patterns (accordion sections, H3-as-question patterns)
- `HowTo` — for step-by-step instructional sections
- `SoftwareApplication` — for downloadable tools (name, operatingSystem, offers: free, downloadUrl)
- `Article` or `TechArticle` — for educational content pages
- `BreadcrumbList` — when breadcrumb navigation is present
- `ImageObject` / `VideoObject` — when media is added to sections
- `speakable` — add to `Article` or `WebPage` to indicate which content sections are suitable for voice assistant / TTS playback; point to lead summary paragraphs using CSS selectors

For SaaS or commercial product pages (when applicable):
- `SoftwareApplication`, `WebApplication`, `Service`, `Offer`
- Include onboarding steps as `HowTo` when present

### 3.9 Structured Data: Synchronization & Maintenance

- Whenever HTML content, components, or layout are modified, **JSON-LD must be updated in the same change.**
- Whenever images, videos, or new sections are added, update schema to reflect them.
- Schema and Bootstrap structure must remain synchronized at all times — they are not independent artifacts.

### 3.10 Structured Data: Validation

All JSON-LD must be valid according to:
- **Google Rich Results Test** (https://search.google.com/test/rich-results)
- **Schema Markup Validator** (https://validator.schema.org/)
- **Schema.org** specification (no invalid nesting, no missing required fields)

Validation must be performed before every deployment (included in pre-release checklist).

### 3.11 Meta Tags

Every page must include:

- `<title>` — descriptive, includes primary keyword, ≤60 chars
- `<meta name="description">` — action-oriented, ≤160 chars
- Open Graph: `og:title`, `og:description`, `og:type`, `og:url`, `og:image`
- Twitter Card: `twitter:card`, `twitter:title`, `twitter:description`
- `<link rel="canonical">` with full URL

### 3.12 Crawlability

- All content must be visible without JavaScript. JS is only for interactive enhancements (download triggers, code viewer truncation, etc.).
- `robots.txt` must allow all crawlers with no disallow rules.
- `sitemap.xml` must be maintained and include all public URLs.
- No content gating, login walls, or cookie consent barriers that block content.

### 3.13 Performance for SEO

- Target <1s Largest Contentful Paint (LCP).
- Minimize external resources. Bootstrap CDN + Google Fonts should be the only external loads.
- Use `rel="preconnect"` for CDN domains.
- Inline critical CSS if needed to eliminate render-blocking resources.

---

## 4. Comprehensive Accessibility

### 4.1 Compliance Target

**WCAG 2.2 Level AA** — all content, all interactions, all pages, no exceptions.

### 4.2 Document Structure & Landmarks

- **Skip navigation:** Every page must include a visually hidden skip link as the first focusable element: `<a href="#main-content" class="visually-hidden-focusable">Skip to main content</a>`. Use Bootstrap's `visually-hidden-focusable` class.
- **Landmarks:** Every page must have `<header>`, `<nav>`, `<main>`, and `<footer>`. Use `<section>` with `aria-labelledby` for content blocks. Use `<aside>` for supplementary content (donation banners, sidebars).
- **Heading hierarchy:** Enforced globally (see SEO section). Screen readers use heading structure as primary navigation — broken hierarchy means broken navigation.

### 4.3 Navigation Accessibility

- **All nav links must be keyboard-reachable via Tab.** No interactive element may be unreachable by keyboard alone.
- **Mobile menu:** Must use Bootstrap's `navbar-toggler` which provides `aria-controls`, `aria-expanded`, and `aria-label` by default. Verify these attributes are present on every build.
- **Current page/section indicator:** Active nav items must have `aria-current="page"` (for multi-page) or `aria-current="true"` (for in-page sections). Implement via IntersectionObserver or scroll spy.
- **Dropdown/submenu support:** If dropdown menus are added, they must be keyboard-navigable (arrow keys within menu, Escape to close) and use `role="menu"` / `role="menuitem"` or Bootstrap's built-in dropdown ARIA.
- **External link indication:** Any link opening in a new tab must communicate this to screen reader users. Use `aria-label="Link text (opens in new tab)"` or append `<span class="visually-hidden">(opens in new tab)</span>`.
- **Anchor link focus management:** When a user clicks an in-page anchor link, focus must move to the target section's heading. Add `tabindex="-1"` to target headings and call `.focus()` via JS on navigation. This prevents screen reader users from losing their place.
- **Breadcrumbs:** If added in the future, use `<nav aria-label="Breadcrumb">` with an `<ol>` and `aria-current="page"` on the last item.

### 4.4 Screen Reader Support

- **Announce dynamic changes.** Any content that changes without a full page reload (download status, form validation, toast notifications) must use an ARIA live region (`aria-live="polite"` for non-urgent, `aria-live="assertive"` for critical).
- **Label all interactive elements.** Every `<button>`, `<a>`, and `<input>` must have a programmatically determinable name — either from visible text content, `aria-label`, or `aria-labelledby`. Icon-only buttons must always have `aria-label`.
- **Decorative content must be hidden.** Emoji used as decoration must have `aria-hidden="true"`. Emoji used meaningfully must have `role="img"` and `aria-label` describing the meaning.
- **Tables must be announced correctly.** All `<table>` elements must have `<th>` with `scope="col"` or `scope="row"`, and either a `<caption>` or `aria-label` describing the table's purpose.
- **Code blocks must be labeled.** Scrollable `<pre>` blocks must have `tabindex="0"`, `role="region"`, and `aria-label` describing the content (e.g., "PowerShell script source code").
- **Reading order must match visual order.** CSS must never rearrange elements in a way that creates a different DOM order from visual order. Screen readers follow DOM order.
- **Do not use `title` attributes as the sole accessible name.** `title` is inconsistently announced across screen readers. Always provide `aria-label` or visible text.
- **Form error messages** (if forms are added) must be associated with their input via `aria-describedby` and announced via `aria-live` when they appear.
- **Test with real screen readers.** Every release must be manually tested with at least one of: NVDA (Windows), VoiceOver (macOS/iOS), or TalkBack (Android).

### 4.5 Keyboard Accessibility

- **Full keyboard operability.** Every user flow (reading content, navigating sections, downloading files, visiting external links) must be completable with keyboard alone.
- **Visible focus indicators.** Every interactive element must show a visible focus ring on `:focus-visible`. Minimum 2px solid outline with ≥3:1 contrast against adjacent colors. Bootstrap provides defaults — verify custom-styled elements (gradient buttons, ghost buttons) retain them.
- **No keyboard traps.** Users must be able to Tab into and out of every component. Scrollable regions (`<pre>` blocks, modals) must not trap focus.
- **Logical tab order.** Tab order must follow visual layout order. Never use positive `tabindex` values (only `0` or `-1`).
- **Escape key behavior.** Any overlay, modal, or expanded element must close on Escape key.

### 4.6 Color & Contrast

- **Minimum contrast ratios:**
  - Normal text (≤18pt): **4.5:1** against background
  - Large text (>18pt bold or >24pt): **3:1** against background
  - UI components and graphical objects: **3:1**
- **Color must never be the sole indicator.** Any information conveyed by color must also have a text label, icon, or pattern. Examples: device status (green/red) must include text like "[DEFAULT]" / "[DISABLED]"; form validation (red border) must include text error message.
- **Audit all color combinations** when changing palette or adding new UI elements. Use a contrast checker tool (WebAIM, axe DevTools, or Chrome DevTools).
- **Dark mode contrast:** The dark palette must pass the same contrast ratios. Muted/dim text colors used for secondary content must be verified — common failure point.

### 4.7 Motion & Animation

- **Respect `prefers-reduced-motion`.** All animations (scroll bounce hints, fade-ins, transitions) must be disabled when `prefers-reduced-motion: reduce` is set:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
      scroll-behavior: auto !important;
    }
  }
  ```
- **No auto-playing media.** If video or audio is added, it must not autoplay. Provide play controls.
- **No flashing content.** Nothing may flash more than 3 times per second.

### 4.8 Responsive & Zoom

- Content must reflow correctly at **200% browser zoom** with no horizontal scroll, no content clipping, and no overlapping elements.
- Touch targets (buttons, links) must be at least **44×44 CSS pixels** on mobile.
- Text must be resizable without assistive technology — never use fixed `px` for body text (use `rem` or `em`). Bootstrap handles this by default.

### 4.9 Accessibility Testing Requirements

Every release or significant change must pass:

1. **Automated audit:** Lighthouse Accessibility score ≥95 (target 100). Zero axe-core violations.
2. **Keyboard-only test:** Complete all user flows (navigate, read, download, visit external links) using only keyboard.
3. **Screen reader test:** Navigate the entire page with NVDA or VoiceOver. Verify: landmarks are announced, headings are navigable via shortcut keys, all interactive elements are labeled, dynamic content changes are announced, reading order makes sense.
4. **Zoom test:** Set browser zoom to 200%. Verify no content is lost, clipped, or requires horizontal scroll.
5. **Contrast audit:** Verify all text/background combinations meet AA ratios using a contrast checking tool.

---

## 5. Content & Copy Standards

- **Tone:** Empathetic but technically precise. Acknowledge frustration, then explain clearly. No condescension.
- **Technical accuracy:** All OS URIs, API names, app setting paths, and keyboard shortcuts must be verified against current OS/app versions before publishing.
- **Platform-inclusive language:** Reference all target platforms (Windows, macOS, Linux) naturally, even when only one is live, to establish cross-platform authority for SEO.
- **No jargon without context:** Technical terms must be introduced with a plain-English explanation before first use.
- **Callout/alert hierarchy:** Danger (red) = critical insight or risk. Warning (amber) = tedium or gotcha. Success (green) = key action or confirmation. Info (blue) = tips and supplementary context.

---

## 6. Payment & Digital Delivery

### 6.1 Payment Provider

- **Stripe** is the sole payment provider. No other checkout systems (LemonSqueezy, Gumroad, Ko-fi, etc.).
- Use **Stripe Payment Links** for checkout. No embedded checkout or overlays — same-tab redirect to Stripe's hosted checkout page.
- Payment methods: **card** (includes Apple Pay and Google Pay on supported devices) + **Link** (Stripe's one-click checkout). No Amazon Pay or other methods.
- After successful checkout, Stripe redirects to a dedicated thank-you page with `{CHECKOUT_SESSION_ID}` appended as a query parameter.
- Stripe test mode is used during development. Live mode product/price/payment-link/webhook must be created separately with `--live` flag before go-live.

### 6.2 Digital Delivery Architecture

- **Cloudflare Worker** (`dl.audiofix.tools`) handles fulfillment:
  - `POST /webhook` — receives Stripe `checkout.session.completed` webhook, generates HMAC-signed download token, sends email via Resend
  - `GET /dl?token=xxx` — validates token signature + expiry, streams file from R2
  - `GET /session-download?session_id=cs_xxx` — verifies session is paid via Stripe API, returns download URL (used by thank-you page for immediate download)
- **Cloudflare R2** stores the downloadable `.zip` file. Files are private — only accessible through the Worker.
- **Resend** sends transactional emails from `noreply@audiofix.tools` with the download link.
- Download tokens are HMAC-SHA256 signed and expire after **72 hours**. No database required.
- The thank-you page provides both an immediate download button (via session verification) and directs the user to check email for a backup link.
- Both the email and thank-you page must clearly state the 72-hour expiry with instructions for getting a new link.

### 6.3 Delivery Format

- Downloadable product is a `.zip` file (not raw `.ps1`) to avoid browser download security warnings.
- Zip contains: the script file + a `README.txt` with quick-start instructions.
- Source code is visible on the tool page (base64-decoded into a code viewer) as a trust/transparency signal — this is intentional, not a leak.

### 6.4 Script Support Prompt

- After a successful run, the script displays a support message with a link to the Stripe checkout URL.
- The prompt must ask "Open the purchase page in your browser?" and only open it if the user says yes.
- **Never auto-launch URLs.** The user must explicitly opt in. Uninvited browser tabs erode trust.

### 6.5 Secrets Management

- All secrets (Stripe keys, webhook secret, Resend API key, HMAC secret) are stored via `wrangler secret put` — never in code or `wrangler.toml`.
- Worker source code lives in `/worker/` within the repo. It contains no secrets.

## 7. Desktop App & MCP Server (.NET 10)

### 7.1 Architecture

The desktop app lives in `/dotnet/` and is a .NET 10 solution with four projects:

| Project | Purpose |
|---|---|
| `AudioFix.Core` | Audio logic — direct COM interop to Windows Core Audio. No UI dependency. |
| `AudioFix.Mcp` | MCP server — 8 tools exposed via the official .NET ModelContextProtocol SDK. |
| `AudioFix.Tray` | System tray app — Win32 P/Invoke (`Shell_NotifyIcon`), no WinForms/WPF/WinUI. |
| `AudioFix.Package` | MSIX packaging — manifest, icons, Windows Copilot ODR registration. |

### 7.2 Design Principles

- **One binary, two modes.** `AudioFix.Tray.exe` runs the tray icon + MCP server together by default. With `--mcp-only`, it runs headless (for Claude Desktop / Copilot to launch as a child process).
- **Core is UI-agnostic.** `AudioFix.Core` has no UI dependency. A WinUI 3 project can be added later for a richer settings panel without touching audio logic.
- **No framework dependency for tray.** The tray icon uses raw Win32 P/Invoke (`Shell_NotifyIconW`, `CreatePopupMenu`, `TrackPopupMenu`). This avoids WinForms/WPF dependency and is NativeAOT-compatible.
- **Direct COM interop.** Audio operations use direct COM calls to `IMMDeviceEnumerator`, `IPolicyConfig`, `IAudioEndpointVolume`, and `IAudioMeterInformation`. No PowerShell middleman.
- **Elevation via manifest.** `app.manifest` uses `highestAvailable` — admin users get one UAC prompt at launch; standard users run without elevation (most features still work).

### 7.3 MCP Tools

The server exposes 8 tools: `list_devices`, `get_default_device`, `set_default_device`, `test_device`, `get_volume`, `set_volume`, `toggle_device`, `diagnose`.

- `toggle_device` (enable/disable) requires administrator privileges. The tool checks elevation at runtime and returns a helpful error message if not elevated — it never triggers an unexpected UAC prompt.
- `diagnose` is the orchestrator — it inspects all devices, volume, mute state, and reports issues with recommendations.

### 7.4 MSIX & Windows Copilot

- MSIX manifest registers the app as an MCP server with the Windows On-Device Agent Registry (ODR) via `uap3:AppExtension` with `com.microsoft.windows.ai.mcpServer`.
- `mcpServerConfig.json` provides static tool descriptions for fast discovery without launching the server.
- `patch-claude-config.ps1` auto-patches Claude Desktop's config to register the MCP server.
- MSIX packaging requires Windows (the `.wapproj` build uses Windows SDK tools). CI/CD on a Windows runner is the recommended build path.

### 7.5 Cross-Platform Node MCP Server

A separate Node.js MCP server lives in `/mcp/` for macOS and Linux. It uses:
- macOS: `SwitchAudioSource` (optional), `osascript`, `afplay`, `system_profiler`
- Linux: `pactl` (PulseAudio/PipeWire), `speaker-test`
- Windows: PowerShell with inline C# interop (fallback for users without .NET)

The Node server is secondary to the .NET app on Windows. It exists primarily for cross-platform coverage.

### 7.6 Build & Test

```bash
# Build (from any OS — cross-compiles on macOS)
cd dotnet && dotnet build

# Run tray app (Windows only — requires COM)
dotnet run --project AudioFix.Tray

# Run MCP server headless (Windows only)
dotnet run --project AudioFix.Tray -- --mcp-only

# Publish self-contained single file (Windows x64)
dotnet publish AudioFix.Tray -c Release -r win-x64 --self-contained
```

### 7.7 No Telemetry

The desktop app and MCP server must never phone home, collect data, send analytics, or make any network request. All operations are local. This is non-negotiable and consistent with the script's zero-telemetry policy.

---

## 8. Deployment & Hosting (Site)

- **Static site only.** No server-side processing, no build step, no SSG framework required (though one may be adopted later if the site grows beyond single-page).
- **Hosting:** GitHub Pages with custom domain `audiofix.tools`. DNS managed by Cloudflare (proxied, SSL mode: Full).
- **Cloudflare Worker:** Deployed separately via `wrangler deploy` from `/worker/` directory. Custom domain: `dl.audiofix.tools`.
- **HTTPS required.** Cloudflare handles edge SSL for the main site; GitHub Pages serves as origin.
- **Analytics:** If added, use a privacy-respecting, cookie-free tool (Plausible, Fathom, Cloudflare Web Analytics). No Google Analytics. No tracking pixels.
- **No telemetry in scripts.** Downloadable tools must never phone home, collect data, or make network requests.

---

## 9. Pre-Release Checklist

Before any deployment or significant merge:

- [ ] All new/modified HTML uses Bootstrap components (no hand-rolled equivalents)
- [ ] Custom CSS is under 50 lines
- [ ] Heading hierarchy is valid (no skips, single H1)
- [ ] All `<section>` elements have `aria-labelledby` or `aria-label`
- [ ] Skip navigation link is present and functional
- [ ] All interactive elements are keyboard-reachable with visible focus indicators
- [ ] All tables have `<th>` with `scope` and `<caption>` or `aria-label`
- [ ] All external links indicate they open in new tab (to screen readers)
- [ ] `prefers-reduced-motion` is respected for all animations
- [ ] JSON-LD uses `@graph`, one `<script>` block in `<head>`, no duplicated entities
- [ ] JSON-LD validated with Google Rich Results Test and Schema Markup Validator
- [ ] Schema matches current Bootstrap component structure (mapping table in 3.6)
- [ ] All `@id` values follow naming convention (3.7) and are stable
- [ ] Meta tags (title, description, OG, Twitter) are present and populated
- [ ] Lighthouse scores: Performance ≥90, Accessibility ≥95, SEO ≥90, Best Practices ≥90
- [ ] axe-core: 0 violations
- [ ] Keyboard-only walkthrough completed
- [ ] Screen reader walkthrough completed (NVDA or VoiceOver)
- [ ] 200% zoom test: no content loss or horizontal scroll
- [ ] Stripe checkout button functions in Chrome, Firefox, Edge, Safari
- [ ] Post-purchase thank-you page displays download link
- [ ] Download email delivers and contains valid download link
- [ ] Download link serves correct `.zip` file from R2

**Desktop app (when modifying `dotnet/`):**

- [ ] Solution builds with zero warnings: `dotnet build dotnet/AudioFix.slnx`
- [ ] MCP server responds to `initialize` JSON-RPC call
- [ ] `mcpServerConfig.json` static_responses match actual server output
- [ ] `toggle_device` checks elevation before attempting — never triggers surprise UAC
- [ ] No network requests, no telemetry, no phone-home behavior
- [ ] `app.manifest` uses `highestAvailable` (not `requireAdministrator`)

---

*These directives are non-negotiable. Any work that does not comply must be revised before merge or deployment.*
