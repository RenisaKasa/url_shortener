import { Component, ElementRef, AfterViewInit, OnDestroy, ViewChild } from '@angular/core';
import { DotLottie } from '@lottiefiles/dotlottie-web';

@Component({
  selector: 'app-link-animation',
  standalone: true,
  template: '<canvas #animationCanvas aria-hidden="true"></canvas>',
  styles: [
    `
      :host {
        display: block;
        width: 100%;
        height: 100%;
      }

      canvas {
        display: block;
        width: 100%;
        height: 100%;
        filter: invert(77%) sepia(95%) saturate(2225%) hue-rotate(204deg)
          brightness(103%) contrast(105%) drop-shadow(0 0 5px #9e64ff);
      }
    `,
  ],
})
export class LinkAnimation implements AfterViewInit, OnDestroy {
  @ViewChild('animationCanvas')
  canvas!: ElementRef<HTMLCanvasElement>;

  private player?: DotLottie;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private readonly updateMotion = () => {
    if (this.reducedMotion.matches) {
      this.player?.pause();
      this.player?.setFrame(0);
    } else {
      this.player?.play();
    }
  };

  ngAfterViewInit(): void {
    DotLottie.setWasmUrl('/animations/dotlottie-player.wasm');
    this.player = new DotLottie({
      canvas: this.canvas.nativeElement,
      src: '/animations/link-chain.json',
      autoplay: !this.reducedMotion.matches,
      loop: true,
    });
    this.reducedMotion.addEventListener('change', this.updateMotion);
  }

  ngOnDestroy(): void {
    this.reducedMotion.removeEventListener('change', this.updateMotion);
    this.player?.destroy();
  }
}
