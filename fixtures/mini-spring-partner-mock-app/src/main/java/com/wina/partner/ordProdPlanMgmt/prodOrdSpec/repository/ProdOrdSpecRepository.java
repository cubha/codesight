package com.wina.partner.ordProdPlanMgmt.prodOrdSpec.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface ProdOrdSpecRepository {
    List<Map<String, Object>> retrieveProdOrdSpecList();
    List<Map<String, Object>> retrievePrdoOrderSpecForIdctExcel();
    List<Map<String, Object>> retrievePrdoLdctList();
}
