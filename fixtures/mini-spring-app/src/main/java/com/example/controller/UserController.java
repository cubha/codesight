package com.example.controller;

import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/users")
public class UserController {

    @GetMapping
    public List<Object> listUsers() {
        return List.of();
    }

    @GetMapping("/{userId}")
    public Object getUser(@PathVariable Long userId) {
        return null;
    }

    @PostMapping
    public Object createUser(@RequestBody Object body) {
        return null;
    }

    @DeleteMapping("/{userId}")
    public void deleteUser(@PathVariable Long userId) {
    }
}
