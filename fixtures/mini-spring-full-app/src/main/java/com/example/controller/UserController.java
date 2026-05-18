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
    public String list() {
        return userService.findAll();
    }

    @GetMapping("/{id}")
    public String get(@PathVariable Long id) {
        return userService.findById(id);
    }

    @PostMapping
    public String create(@RequestBody String body) {
        return userService.create(body);
    }

    @PutMapping("/{id}")
    public String update(@PathVariable Long id, @RequestBody String body) {
        return userService.update(id, body);
    }

    @DeleteMapping("/{id}")
    public String delete(@PathVariable Long id) {
        return userService.delete(id);
    }
}
