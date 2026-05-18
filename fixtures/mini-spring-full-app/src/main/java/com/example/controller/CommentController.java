package com.example.controller;

import com.example.service.CommentService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/comments")
public class CommentController {
    @Autowired
    private CommentService commentService;

    @GetMapping
    public String list() {
        return commentService.findAll();
    }

    @PostMapping
    public String create(@RequestBody String body) {
        return commentService.create(body);
    }

    @DeleteMapping("/{id}")
    public String delete(@PathVariable Long id) {
        return commentService.delete(id);
    }
}
