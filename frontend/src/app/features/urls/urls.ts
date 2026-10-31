import { MessagesService } from '../../core/i18n/messages';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-urls',
  imports: [],
  templateUrl: './urls.html',
  styleUrl: './urls.scss',
})
export class Urls {
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  readonly year = new Date().getFullYear();

}
