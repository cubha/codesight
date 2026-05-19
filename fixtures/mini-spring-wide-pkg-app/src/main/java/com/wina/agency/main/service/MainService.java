package com.wina.agency.main.service;

import com.wina.agency.main.repository.MainRepository;
import org.springframework.stereotype.Service;

@Service
public class MainService {
    private final MainRepository repository;
    public MainService(MainRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
