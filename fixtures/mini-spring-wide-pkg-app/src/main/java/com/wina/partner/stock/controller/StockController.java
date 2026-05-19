package com.wina.partner.stock.controller;

import com.wina.partner.stock.service.StockService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/stock")
public class StockController {
    private final StockService service;
    public StockController(StockService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
