import { Component, OnInit } from '@angular/core'
import { ActivatedRoute } from '@angular/router'

@Component({
  selector: 'app-user-detail',
  template: `<h1>User Detail</h1><p>ID: {{ userId }}</p>`,
})
export class UserDetailComponent implements OnInit {
  userId = ''

  constructor(private route: ActivatedRoute) {}

  ngOnInit(): void {
    this.userId = this.route.snapshot.paramMap.get('id') ?? ''
  }
}
