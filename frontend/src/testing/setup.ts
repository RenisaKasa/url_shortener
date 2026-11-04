import { beforeEach, vi } from 'vitest';

vi.mock('@lottiefiles/dotlottie-web', () => ({
  DotLottie: vi.fn(class {
    static setWasmUrl: ReturnType<typeof vi.fn> = vi.fn();
    pause = vi.fn();
    play = vi.fn();
    setFrame = vi.fn();
    destroy = vi.fn();
  }),
}));
vi.mock('qrcode', () => ({ default: { toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,cXI=') } }));

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', { configurable: true, writable: true, value: vi.fn(() => ({
    matches: false, addEventListener: vi.fn(), removeEventListener: vi.fn(),
  })) });
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn().mockResolvedValue(undefined) } });
  window.scrollTo = vi.fn();
  HTMLElement.prototype.scrollIntoView = vi.fn();
  HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
});
