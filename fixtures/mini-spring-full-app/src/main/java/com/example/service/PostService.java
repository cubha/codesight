package com.example.service;

import com.example.repository.PostRepository;
import com.example.repository.UserRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class PostService {
    @Autowired
    private PostRepository postRepository;

    @Autowired
    private UserRepository userRepository;

    public String findAll() { return postRepository.findAll(); }
    public String findById(Long id) { return postRepository.findById(id); }
    public String create(String body) {
        userRepository.touchAuthor(body);
        return postRepository.save(body);
    }
    public String patch(Long id, String body) { return postRepository.patch(id, body); }
}
