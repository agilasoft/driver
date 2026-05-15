# CargoNext Design Analysis

## Color Palette (from screenshot)
- **Header gradient**: #3478C6 to #5B9BD5 (medium blue gradient, top to bottom)
- **Primary accent (FAB)**: #F27A2E (orange)
- **Background**: #FFFFFF (pure white)
- **Foreground text**: #1A1A1A (near black)
- **Muted text**: #8E8E93 (iOS system gray)
- **Border/divider**: #E5E5EA (light gray)
- **Surface**: #F5F5F7 (very light gray for cards)
- **Success**: #34C759 (iOS green)
- **Warning**: #FF9500 (iOS orange)
- **Error**: #FF3B30 (iOS red)

## Layout Pattern
1. Blue gradient header (compact, ~150px) with app logo + title + subtitle
2. Clean white body area with generous whitespace
3. Empty states centered with icon + title + description
4. Floating orange circular FAB (bottom-right) for primary action
5. Bottom branding: "Powered by Agilasoft Cloud Technologies Inc."
6. No visible borders on cards — uses shadow/elevation instead
7. Rounded corners throughout (16px radius)

## Typography
- Title in header: Bold white, ~20px
- Subtitle in header: Regular white with opacity, ~14px
- Section titles: Semibold, ~18px
- Body text: Regular, ~15px
- Caption/hint: Regular gray, ~13px
