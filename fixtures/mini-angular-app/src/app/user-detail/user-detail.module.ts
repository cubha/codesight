import { NgModule } from '@angular/core'
import { CommonModule } from '@angular/common'
import { RouterModule } from '@angular/router'
import { UserDetailComponent } from './user-detail.component'

@NgModule({
  declarations: [UserDetailComponent],
  imports: [
    CommonModule,
    RouterModule.forChild([{ path: '', component: UserDetailComponent }]),
  ],
})
export class UserDetailModule {}
