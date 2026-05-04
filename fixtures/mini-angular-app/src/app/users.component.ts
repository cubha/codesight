import { Component, OnInit } from '@angular/core'
import { CommonModule } from '@angular/common'

@Component({
  selector: 'app-users',
  standalone: true,
  imports: [CommonModule],
  template: `<h1>Users</h1><ul><li *ngFor="let u of users">{{ u.name }}</li></ul>`,
})
export class UsersComponent implements OnInit {
  users: Array<{ id: number; name: string }> = []

  ngOnInit(): void {
    this.users = [{ id: 1, name: 'Alice' }, { id: 2, name: 'Bob' }]
  }
}
