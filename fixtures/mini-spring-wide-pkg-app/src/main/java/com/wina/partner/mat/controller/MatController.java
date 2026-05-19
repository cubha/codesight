package com.wina.partner.mat.controller;

import com.wina.partner.mat.service.MatService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/mat")
public class MatController {
    private final MatService service;
    public MatController(MatService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
