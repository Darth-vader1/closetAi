# Verification Steps for Wardrobe Hero Animation

## Quick Verification Commands

Run these commands in order to verify the implementation:

```bash
# 1. Type check
npm run typecheck

# 2. Lint check
npm run lint

# 3. Production build
npm run build

# 4. Start production server
npm run start
```

## Lighthouse Testing

After starting the production server:

1. Open Chrome/Edge browser
2. Navigate to `http://localhost:3000`
3. Open DevTools (F12)
4. Go to "Lighthouse" tab
5. Select "Mobile" device
6. Check all categories
7. Click "Generate report"

### Metrics to Record:

**BEFORE** (baseline with WardrobePreview):
- Performance: ___
- LCP: ___
- CLS: ___
- TBT: ___

**AFTER** (with WardrobeHero animation):
- Performance: ___
- LCP: ___
- CLS: ___
- TBT: ___

### Success Criteria:
- ✅ Performance ≥ 90
- ✅ LCP increase < 200ms
- ✅ CLS remains < 0.1
- ✅ TBT < 300ms

## Manual Testing Checklist

### Animation Behavior
- [ ] Doors swing open on first page load
- [ ] Doors remain open on page refresh (same session)
- [ ] Clothing items scroll horizontally in smooth loop
- [ ] Decorative card appears after doors open
- [ ] Pause button appears and works correctly

### Reduced Motion
- [ ] Set OS to prefer reduced motion
- [ ] Reload page
- [ ] Verify: Doors are open, no animations play
- [ ] Clothing items in static positions

### Pause/Play Control
- [ ] Click pause button
- [ ] Animation stops immediately
- [ ] Click play button
- [ ] Animation resumes from current position

### Scroll Behavior
- [ ] Scroll hero out of view
- [ ] Animation should pause (check with dev tools)
- [ ] Scroll back into view
- [ ] Animation resumes

### Tab Visibility
- [ ] Switch to different tab
- [ ] Animation should pause
- [ ] Switch back to ClosetAI tab
- [ ] Animation resumes

### Responsive Design
Test at these viewport widths:
- [ ] 360px (small mobile)
- [ ] 768px (tablet)
- [ ] 1024px (small desktop)
- [ ] 1440px (large desktop)

Verify:
- No horizontal scroll
- Text remains readable
- Buttons are accessible
- Animation scales appropriately

### Accessibility
- [ ] Tab through page with keyboard
- [ ] Pause button receives focus
- [ ] Focus ring is visible
- [ ] Space/Enter activates pause button
- [ ] Screen reader: decorative elements ignored

### JavaScript Disabled
- [ ] Disable JavaScript in browser
- [ ] Reload page
- [ ] Verify: Headline and buttons still visible
- [ ] Verify: Page is usable without animation

### Network Throttling
- [ ] Open DevTools Network tab
- [ ] Set throttling to "Fast 4G"
- [ ] Reload page (hard refresh)
- [ ] Verify: Content loads progressively
- [ ] Verify: No long blocking times

## Build Output Check

After running `npm run build`, check:

```bash
# Check bundle sizes
ls -lh .next/static/chunks/

# Look for the marketing route chunk
# Should be reasonable size increase (<10KB)
```

## Files to Verify

### Created:
- `src/components/marketing/wardrobe-hero.tsx`
- `verify-build.md` (this file)

### Modified:
- `src/components/marketing/sections.tsx`
- `src/app/globals.css`

## Expected Results

### Bundle Size Impact:
- **JavaScript**: +4-5 KB (minified)
- **CSS**: +0.8 KB
- **SVG**: Inline, ~3.5 KB
- **Total**: ~8-9 KB added

### Performance Impact:
- **LCP**: Should increase by <100ms (SVG is small and inline)
- **CLS**: Should remain 0 (fixed aspect ratio)
- **TBT**: Should increase by <50ms (minimal JS)
- **FCP**: No significant change

### Lighthouse Scores (Expected):
- **Performance**: 90-95
- **Accessibility**: 100
- **Best Practices**: 100
- **SEO**: 100

## Troubleshooting

### If build fails:
1. Check TypeScript errors: `npm run typecheck`
2. Check for syntax errors in new files
3. Verify imports are correct

### If animation doesn't work:
1. Check browser console for errors
2. Verify CSS animations are loaded
3. Check sessionStorage is accessible
4. Test in incognito mode (fresh session)

### If performance regresses significantly:
1. Check if animation is causing layout shifts
2. Verify will-change properties aren't overused
3. Check if IntersectionObserver is working
4. Profile with Chrome DevTools Performance tab

## Notes

- The wardrobe hero replaces the WardrobePreview component
- Old WardrobePreview is still available but unused
- Animation is fully self-contained in wardrobe-hero.tsx
- No external dependencies added
- Works with existing app infrastructure
