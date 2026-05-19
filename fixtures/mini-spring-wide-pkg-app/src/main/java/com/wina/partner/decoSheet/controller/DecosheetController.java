package com.wina.partner.decoSheet.controller;

import com.wina.partner.decoSheet.service.DecosheetService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/decoSheet")
public class DecosheetController {
    private final DecosheetService service;
    public DecosheetController(DecosheetService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
