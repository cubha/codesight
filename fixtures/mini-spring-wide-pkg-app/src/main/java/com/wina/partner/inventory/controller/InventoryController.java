package com.wina.partner.inventory.controller;

import com.wina.partner.inventory.service.InventoryService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/inventory")
public class InventoryController {
    private final InventoryService service;
    public InventoryController(InventoryService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
