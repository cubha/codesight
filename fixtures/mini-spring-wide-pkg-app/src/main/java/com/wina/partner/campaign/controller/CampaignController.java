package com.wina.partner.campaign.controller;

import com.wina.partner.campaign.service.CampaignService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/partner/campaign")
public class CampaignController {
    private final CampaignService service;
    public CampaignController(CampaignService service) { this.service = service; }
    @GetMapping("/list") public String list() { return service.list(); }
    @PostMapping("/create") public String create(@RequestBody String body) { return service.create(body); }
}
