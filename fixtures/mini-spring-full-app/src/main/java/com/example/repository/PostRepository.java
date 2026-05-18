package com.example.repository;

import org.springframework.stereotype.Repository;

@Repository
public class PostRepository {
    public String findAll() { return ""; }
    public String findById(Long id) { return ""; }
    public String save(String body) { return ""; }
    public String patch(Long id, String body) { return ""; }
}
