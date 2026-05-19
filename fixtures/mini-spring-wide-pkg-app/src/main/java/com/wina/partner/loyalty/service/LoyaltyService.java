package com.wina.partner.loyalty.service;

import com.wina.partner.loyalty.repository.LoyaltyRepository;
import org.springframework.stereotype.Service;

@Service
public class LoyaltyService {
    private final LoyaltyRepository repository;
    public LoyaltyService(LoyaltyRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
