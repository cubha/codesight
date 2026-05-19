package com.wina.headoffice.materialMgmt.cuttingPlanInfoMgmt.repository;

import org.apache.ibatis.annotations.Mapper;
import java.util.List;
import java.util.Map;

@Mapper
public interface CuttingPlanMgmtRepository {
    List<Map<String, Object>> retrieveMoldList();
    List<Map<String, Object>> retrieveMoldNrmList();
    int insertMoldNrm();
}
