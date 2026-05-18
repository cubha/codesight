package com.example.repository;

import org.springframework.stereotype.Repository;

@Repository
public class OrderRepository {
    public String findAll() { return ""; }
    public String findById(Long id) { return ""; }
    public String save(String body) { return ""; }
    public String cancel(Long id) { return ""; }
}
