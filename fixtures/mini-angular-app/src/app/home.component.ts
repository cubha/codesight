import { Component } from '@angular/core'
import { CommonModule } from '@angular/common'
import { UsersComponent } from './users.component'

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, UsersComponent],
  template: `<h1>Home</h1><p>Welcome</p><app-users />`,
})
export class HomeComponent {}
