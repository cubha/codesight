package com.wina.partner.vendor.service;

import com.wina.partner.vendor.repository.VendorRepository;
import org.springframework.stereotype.Service;

@Service
public class VendorService {
    private final VendorRepository repository;
    public VendorService(VendorRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
