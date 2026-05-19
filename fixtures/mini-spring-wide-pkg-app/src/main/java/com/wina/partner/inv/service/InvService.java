package com.wina.partner.inv.service;

import com.wina.partner.inv.repository.InvRepository;
import org.springframework.stereotype.Service;

@Service
public class InvService {
    private final InvRepository repository;
    public InvService(InvRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
