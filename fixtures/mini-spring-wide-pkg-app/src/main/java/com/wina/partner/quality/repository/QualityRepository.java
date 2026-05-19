package com.wina.partner.quality.repository;

import com.wina.partner.quality.domain.Quality;
import org.springframework.data.jpa.repository.JpaRepository;

public interface QualityRepository extends JpaRepository<Quality, Long> {
}
