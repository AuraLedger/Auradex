import { Component, Inject, EventEmitter} from '@angular/core';
import { MatDialog, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material';
import { UserService } from '../user.service';

@Component({
  selector: 'app-delete',
  templateUrl: './delete.component.html',
  styleUrls: ['./delete.component.scss']
})
export class DeleteComponent {

  public confirmName: string;

  constructor(    
    public dialogRef: MatDialogRef<DeleteComponent>,
    @Inject(MAT_DIALOG_DATA) public data: any,
    public userService: UserService
  ) { }

  deleteAccount() {
    if(this.confirmName == this.data.accountName)
    {
      if(this.userService.accounts.hasOwnProperty(this.data.accountName)) {
        delete this.userService.accounts[this.data.accountName];
        this.userService.save();
        this.userService.showSuccess("Deleted " + this.data.accountName);
        this.dialogRef.close();
      }
      else
      {
        var err = "Error: account not found";
        this.userService.showError(err);
        throw err; 
      }
    } else {
      var err = "Error: account name does not match input";
      this.userService.showError(err);
      throw err; 
    }
  }
}
