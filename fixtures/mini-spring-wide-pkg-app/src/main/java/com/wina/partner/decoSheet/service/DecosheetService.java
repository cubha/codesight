package com.wina.partner.decoSheet.service;

import com.wina.partner.decoSheet.repository.DecosheetRepository;
import org.springframework.stereotype.Service;

@Service
public class DecosheetService {
    private final DecosheetRepository repository;
    public DecosheetService(DecosheetRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
