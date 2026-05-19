package com.wina.partner.billing.service;

import com.wina.partner.billing.repository.BillingRepository;
import org.springframework.stereotype.Service;

@Service
public class BillingService {
    private final BillingRepository repository;
    public BillingService(BillingRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
