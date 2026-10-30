import { MessagesService } from '../../core/i18n/messages';
import { Component, inject } from '@angular/core';

@Component({
  selector: 'app-admin',
  imports: [],
  templateUrl: './admin.html',
  styleUrl: './admin.scss',
})
export class Admin {
  readonly copy = inject(MessagesService);
  readonly text = this.copy.text;
  readonly year = new Date().getFullYear();

}
