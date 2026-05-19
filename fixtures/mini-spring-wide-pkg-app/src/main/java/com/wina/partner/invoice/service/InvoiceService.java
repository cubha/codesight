package com.wina.partner.invoice.service;

import com.wina.partner.invoice.repository.InvoiceRepository;
import org.springframework.stereotype.Service;

@Service
public class InvoiceService {
    private final InvoiceRepository repository;
    public InvoiceService(InvoiceRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
