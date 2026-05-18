package com.example.controller;

import com.example.service.UserService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final UserService userService;

    public UserController(UserService userService) {
        this.userService = userService;
    }

    @GetMapping
    public Object listUsers() {
        return userService.findAll();
    }

    @PostMapping
    public Object createUser(@RequestBody Object body) {
        return userService.create(body);
    }
}
