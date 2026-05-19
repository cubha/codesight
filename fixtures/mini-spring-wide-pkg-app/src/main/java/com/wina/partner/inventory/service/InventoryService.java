package com.wina.partner.inventory.service;

import com.wina.partner.inventory.repository.InventoryRepository;
import org.springframework.stereotype.Service;

@Service
public class InventoryService {
    private final InventoryRepository repository;
    public InventoryService(InventoryRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
