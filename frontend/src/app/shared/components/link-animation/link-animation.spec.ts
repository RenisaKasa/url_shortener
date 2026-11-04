import { TestBed } from '@angular/core/testing';
import { DotLottie } from '@lottiefiles/dotlottie-web';
import { LinkAnimation } from './link-animation';

describe('Link animation accessibility and lifecycle', () => {
  it.each([false, true])('honors reduced motion (%s), responds to changes, and releases the player', async reduced => {
    const motion = { matches: reduced, addEventListener: vi.fn(), removeEventListener: vi.fn() };
    vi.mocked(window.matchMedia).mockReturnValue(motion as unknown as MediaQueryList);
    TestBed.configureTestingModule({ imports: [LinkAnimation] });
    const fixture = TestBed.createComponent(LinkAnimation);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(DotLottie.setWasmUrl).toHaveBeenCalledWith('/animations/dotlottie-player.wasm');
    expect(DotLottie).toHaveBeenLastCalledWith(expect.objectContaining({ autoplay: !reduced, loop: true }));
    const player = vi.mocked(DotLottie).mock.results.at(-1)?.value as DotLottie;
    const changed = motion.addEventListener.mock.calls[0][1] as () => void;
    motion.matches = true; changed();
    expect(player.pause).toHaveBeenCalled(); expect(player.setFrame).toHaveBeenCalledWith(0);
    motion.matches = false; changed(); expect(player.play).toHaveBeenCalled();
    fixture.destroy(); expect(player.destroy).toHaveBeenCalled();
    expect(motion.removeEventListener).toHaveBeenCalledWith('change', changed);
  });
});
