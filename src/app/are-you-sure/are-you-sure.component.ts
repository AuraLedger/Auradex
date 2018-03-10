import { Component, Inject } from '@angular/core';
import { MAT_DIALOG_DATA } from '@angular/material';

@Component({
  selector: 'app-are-you-sure',
  templateUrl: './are-you-sure.component.html',
  styleUrls: ['./are-you-sure.component.scss']
})
export class AreYouSureComponent {
    constructor(@Inject(MAT_DIALOG_DATA) public data: any) { }
}
