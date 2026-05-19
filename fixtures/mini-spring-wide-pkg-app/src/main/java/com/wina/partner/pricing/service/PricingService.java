package com.wina.partner.pricing.service;

import com.wina.partner.pricing.repository.PricingRepository;
import org.springframework.stereotype.Service;

@Service
public class PricingService {
    private final PricingRepository repository;
    public PricingService(PricingRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
