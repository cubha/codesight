package com.example.service;

import com.example.repository.CommentRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class CommentService {
    private CommentRepository commentRepository;

    @Autowired
    public void setCommentRepository(CommentRepository commentRepository) {
        this.commentRepository = commentRepository;
    }

    public String findAll() { return commentRepository.findAll(); }
    public String create(String body) { return commentRepository.save(body); }
    public String delete(Long id) { return commentRepository.delete(id); }
}
