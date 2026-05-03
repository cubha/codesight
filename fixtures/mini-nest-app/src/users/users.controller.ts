import { Controller, Get, Post, Delete } from '@nestjs/common'

@Controller('users')
export class UsersController {
  @Get()
  findAll() {
    return []
  }

  @Get(':id')
  findOne() {
    return null
  }

  @Post()
  create() {
    return {}
  }

  @Delete(':id')
  remove() {
    return {}
  }
}
