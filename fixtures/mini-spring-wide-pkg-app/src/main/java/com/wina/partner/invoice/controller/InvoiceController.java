package com.wina.partner.invoice.controller;

import com.wina.partner.invoice.service.InvoiceService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/invoice")
public class InvoiceController {
    private final InvoiceService service;
    public InvoiceController(InvoiceService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
