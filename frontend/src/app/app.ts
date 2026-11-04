import { Component, inject } from '@angular/core';
import { Router, RouterOutlet } from '@angular/router';
import { SessionCheckState } from './core/guards/auth-guard';
import { MessagesService } from './core/i18n/messages';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss'
})
export class App {
  readonly session = inject(SessionCheckState);
  readonly text = inject(MessagesService).text;
  private readonly router = inject(Router);

  async retrySession(): Promise<void> {
    const url = this.session.failedUrl();
    if (!url || this.session.checking()) return;
    this.session.checking.set(true);
    try {
      await this.router.navigateByUrl(url, { onSameUrlNavigation: 'reload' });
    } finally {
      this.session.checking.set(false);
    }
  }
}
