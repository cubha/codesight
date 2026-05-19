package com.wina.partner.contract.controller;

import com.wina.partner.contract.service.ContractService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/contract")
public class ContractController {
    private final ContractService service;
    public ContractController(ContractService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
