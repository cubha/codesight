package com.wina.partner.campaign.service;

import com.wina.partner.campaign.repository.CampaignRepository;
import org.springframework.stereotype.Service;

@Service
public class CampaignService {
    private final CampaignRepository repository;
    public CampaignService(CampaignRepository repository) { this.repository = repository; }
    public String list() { return ""; }
    public String create(String body) { return ""; }
}
