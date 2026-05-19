package com.wina.partner.mat.service;

import com.wina.partner.mat.repository.MatRepository;
import org.springframework.stereotype.Service;

@Service
public class MatService {
    private final MatRepository repository;
    public MatService(MatRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
