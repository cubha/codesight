package com.wina.partner.campaign.repository;

import com.wina.partner.campaign.domain.Campaign;
import org.springframework.data.jpa.repository.JpaRepository;

public interface CampaignRepository extends JpaRepository<Campaign, Long> {
}
