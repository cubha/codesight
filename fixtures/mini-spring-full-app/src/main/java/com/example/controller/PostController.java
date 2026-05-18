package com.example.controller;

import com.example.service.PostService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/posts")
public class PostController {
    private final PostService postService;

    @Autowired
    public PostController(PostService postService) {
        this.postService = postService;
    }

    @GetMapping
    public String list() {
        return postService.findAll();
    }

    @GetMapping("/{id}")
    public String get(@PathVariable Long id) {
        return postService.findById(id);
    }

    @PostMapping
    public String create(@RequestBody String body) {
        return postService.create(body);
    }

    @PatchMapping("/{id}")
    public String patch(@PathVariable Long id, @RequestBody String body) {
        return postService.patch(id, body);
    }
}
