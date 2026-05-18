package com.example.repository;

import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    public String findAll() { return ""; }
    public String findById(Long id) { return ""; }
    public String save(String body) { return ""; }
    public String update(Long id, String body) { return ""; }
    public String delete(Long id) { return ""; }
    public String touchAuthor(String body) { return ""; }
}
